// ABOUTME: CLI entry point for deckbox.
// ABOUTME: Thin wrapper over deckbox-core using clap for argument parsing.

use clap::{Parser, Subcommand};
use deckbox_core::definition::DeckDefinition;
use deckbox_core::operations;
use deckbox_core::persistence;
use deckbox_core::session::Session;
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "deckbox", about = "Manage decks of cards")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new session from a deck definition
    New {
        /// Path to the YAML deck definition
        definition: PathBuf,
        /// Session name
        name: String,
        /// Shuffle the deck on creation
        #[arg(long)]
        shuffle: bool,
    },
    /// Draw cards from a container
    Draw {
        /// Session name
        session: String,
        /// Number of cards to draw
        #[arg(long, default_value_t = 1)]
        count: usize,
        /// Source container
        #[arg(long, default_value = "draw_pile")]
        from: String,
        /// Destination container
        #[arg(long, default_value = "drawn")]
        to: String,
    },
    /// Move specific cards between containers
    Move {
        /// Session name
        session: String,
        /// Card instance IDs to move
        #[arg(long, required = true, num_args = 1..)]
        cards: Vec<String>,
        /// Source container
        #[arg(long)]
        from: String,
        /// Destination container
        #[arg(long)]
        to: String,
    },
    /// Move all cards from one container to another
    MoveAll {
        /// Session name
        session: String,
        /// Source container
        #[arg(long)]
        from: String,
        /// Destination container
        #[arg(long)]
        to: String,
    },
    /// Shuffle a container
    Shuffle {
        /// Session name
        session: String,
        /// Container to shuffle
        #[arg(long, default_value = "draw_pile")]
        container: String,
    },
    /// Peek at the top cards of a container
    Peek {
        /// Session name
        session: String,
        /// Number of cards to peek at
        #[arg(long, default_value_t = 1)]
        count: usize,
        /// Container to peek into
        #[arg(long, default_value = "draw_pile")]
        container: String,
    },
    /// List containers or cards in a container
    List {
        /// Session name
        session: String,
        /// Specific container to list
        #[arg(long)]
        container: Option<String>,
    },
    /// Reset a session to its initial state
    Reset {
        /// Session name
        session: String,
    },
    /// List all saved sessions
    Sessions,
}

fn sessions_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let base = if let Ok(dir) = std::env::var("DECKBOX_DATA_DIR") {
        PathBuf::from(dir)
    } else {
        dirs::data_dir()
            .ok_or("cannot determine data directory")?
            .join("deckbox")
    };
    Ok(base.join("sessions"))
}

fn session_path(name: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    Ok(sessions_dir()?.join(format!("{}.yaml", name)))
}

fn load_session(name: &str) -> Result<(Session, DeckDefinition), Box<dyn std::error::Error>> {
    let path = session_path(name)?;
    if !path.exists() {
        return Err(deckbox_core::DeckboxError::SessionNotFound(name.into()).into());
    }
    let file = fs::File::open(&path)?;
    let reader = std::io::BufReader::new(file);
    let session = persistence::load_session(reader)?;
    let def_yaml = fs::read_to_string(&session.definition_path)
        .map_err(|e| format!("cannot read definition '{}': {}", session.definition_path.display(), e))?;
    let def = DeckDefinition::from_yaml(&def_yaml)?;
    let warnings = persistence::check_definition_mismatch(&session, &def);
    for warning in &warnings {
        match warning {
            deckbox_core::Warning::DefinitionMismatch { added, removed } => {
                if !added.is_empty() {
                    eprintln!("Warning: cards added to definition: {}", added.join(", "));
                }
                if !removed.is_empty() {
                    eprintln!("Warning: cards removed from definition: {}", removed.join(", "));
                }
                eprintln!("Run 'deckbox reset {}' to pick up changes.", name);
            }
        }
    }
    Ok((session, def))
}

fn save_session(session: &Session) -> Result<(), Box<dyn std::error::Error>> {
    let dir = sessions_dir()?;
    fs::create_dir_all(&dir)?;
    let path = session_path(&session.name)?;
    let file = fs::File::create(&path)?;
    let mut writer = std::io::BufWriter::new(file);
    persistence::save_session(session, &mut writer)?;
    Ok(())
}

fn print_cards(cards: &[String], def: &DeckDefinition) {
    for instance_id in cards {
        match operations::resolve(instance_id, def) {
            Ok(card) => println!("  {} — {}", instance_id, card.text),
            Err(_) => println!("  {} — (unknown)", instance_id),
        }
    }
}

fn run(cli: Cli) -> Result<(), Box<dyn std::error::Error>> {
    match cli.command {
        Commands::New {
            definition,
            name,
            shuffle,
        } => {
            let path = session_path(&name)?;
            if path.exists() {
                Err(deckbox_core::DeckboxError::DuplicateSession(name).into())
            } else {
                let def_path = fs::canonicalize(&definition)?;
                let yaml = fs::read_to_string(&def_path)?;
                let def = DeckDefinition::from_yaml(&yaml)?;
                let session = Session::new(&name, def_path, &def, shuffle);
                save_session(&session)?;
                println!("Session '{}' created from '{}'", session.name, definition.display());
                let info = operations::containers(&session);
                for (container, count) in info {
                    println!("  {}: {} cards", container, count);
                }
                Ok(())
            }
        }

        Commands::Draw {
            session: name,
            count,
            from,
            to,
        } => {
            let (mut session, def) = load_session(&name)?;
            let drawn = operations::draw(&mut session, &from, &to, count)?;
            println!("Drew {} card(s) from '{}' to '{}':", drawn.len(), from, to);
            print_cards(&drawn, &def);
            save_session(&session)?;
            Ok(())
        }

        Commands::Move {
            session: name,
            cards,
            from,
            to,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::move_cards(&mut session, &cards, &from, &to)?;
            println!("Moved {} card(s) from '{}' to '{}'", cards.len(), from, to);
            save_session(&session)?;
            Ok(())
        }

        Commands::MoveAll {
            session: name,
            from,
            to,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::move_all(&mut session, &from, &to)?;
            println!("Moved all cards from '{}' to '{}'", from, to);
            save_session(&session)?;
            Ok(())
        }

        Commands::Shuffle {
            session: name,
            container,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::shuffle(&mut session, &container)?;
            println!("Shuffled '{}'", container);
            save_session(&session)?;
            Ok(())
        }

        Commands::Peek {
            session: name,
            count,
            container,
        } => {
            let (session, def) = load_session(&name)?;
            let peeked = operations::peek(&session, &container, count)?;
            println!("Top {} card(s) in '{}':", peeked.len(), container);
            print_cards(peeked, &def);
            Ok(())
        }

        Commands::List {
            session: name,
            container,
        } => {
            let (session, def) = load_session(&name)?;
            match container {
                Some(c) => {
                    let cards = operations::list(&session, &c)?;
                    println!("'{}' ({} cards):", c, cards.len());
                    print_cards(cards, &def);
                }
                None => {
                    let info = operations::containers(&session);
                    println!("Session '{}' containers:", name);
                    for (container, count) in info {
                        println!("  {}: {} cards", container, count);
                    }
                }
            }
            Ok(())
        }

        Commands::Reset { session: name } => {
            let (session, def) = load_session(&name)?;
            let reset = session.reset(&def);
            save_session(&reset)?;
            println!("Session '{}' reset", name);
            Ok(())
        }

        Commands::Sessions => {
            let dir = sessions_dir()?;
            if !dir.exists() {
                println!("No saved sessions.");
                return Ok(());
            }
            let mut entries: Vec<_> = fs::read_dir(&dir)?
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let path = e.path();
                    if path.extension().is_some_and(|ext| ext == "yaml") {
                        path.file_stem().map(|s| s.to_string_lossy().into_owned())
                    } else {
                        None
                    }
                })
                .collect();
            entries.sort();
            if entries.is_empty() {
                println!("No saved sessions.");
            } else {
                for name in &entries {
                    println!("  {}", name);
                }
            }
            Ok(())
        }
    }
}

fn main() {
    let cli = Cli::parse();
    if let Err(e) = run(cli) {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
