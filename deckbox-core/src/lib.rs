// ABOUTME: Core library for deckbox — deck management with draw-without-replacement semantics.
// ABOUTME: Re-exports public types and modules.

pub mod error;
pub mod definition;
pub mod session;
pub mod operations;

pub use error::{DeckboxError, Result};
pub use definition::{CardDef, DeckDefinition};
pub use session::{InstanceId, Session};
