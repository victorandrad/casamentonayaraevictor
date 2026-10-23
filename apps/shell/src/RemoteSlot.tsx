import { Component, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';

class RemoteErrorBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[shell] remote "${this.props.name}" failed to load`, error);
  }

  render() {
    if (this.state.failed) {
      return <div className="nv-remote-fallback">Esta seção está indisponível no momento.</div>;
    }
    return this.props.children;
  }
}

// Renders a federated module; if its remote is down, only that section degrades.
export function RemoteSlot({ name, component: Remote }: { name: string; component: LazyExoticComponent<ComponentType> }) {
  return (
    <RemoteErrorBoundary name={name}>
      <Suspense fallback={<div className="nv-remote-fallback">Carregando…</div>}>
        <Remote />
      </Suspense>
    </RemoteErrorBoundary>
  );
}
