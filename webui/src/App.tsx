import { Cabinet } from './components/Cabinet'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { EngineProvider } from './engine/useEngine'
import { useWorkspace } from './model/store'

export function AppContent() {
  const decks = useWorkspace((s) => s.decks)
  const selUid = useWorkspace((s) => s.selUid)
  const hasSelection = decks.some((d) => d.uid === selUid)

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Cabinet />
        <div className="pane-center">
          <div data-testid="center-slot">
            {!hasSelection && <EmptyState hasDecks={decks.length > 0} />}
          </div>
        </div>
        <div className="pane-right" data-testid="right-pane-slot" />
      </div>
    </div>
  )
}

function App() {
  return (
    <EngineProvider>
      <AppContent />
    </EngineProvider>
  )
}

export default App
