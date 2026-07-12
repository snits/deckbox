import { EngineProvider } from './engine/useEngine'

function AppContent() {
  return <div className="app">Deck Forge</div>
}

function App() {
  return (
    <EngineProvider>
      <AppContent />
    </EngineProvider>
  )
}

export default App
