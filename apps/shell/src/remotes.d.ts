// Modules exposed by each remote (see the `exposes` in apps/*/rsbuild.config.ts).
type RemoteComponent = import('react').ComponentType;

declare module 'evento/Evento' { const C: RemoteComponent; export default C; }
declare module 'evento/Traje' { const C: RemoteComponent; export default C; }
declare module 'evento/Local' { const C: RemoteComponent; export default C; }
declare module 'rsvp/Rsvp' { const C: RemoteComponent; export default C; }
declare module 'rsvp/Portaria' { const C: RemoteComponent; export default C; }
declare module 'presentes/Presentes' { const C: RemoteComponent; export default C; }
declare module 'presentes/Presentear' { const C: RemoteComponent; export default C; }
declare module 'mural/Galeria' { const C: RemoteComponent; export default C; }
declare module 'mural/Recados' { const C: RemoteComponent; export default C; }
declare module 'painel/Painel' { const C: RemoteComponent; export default C; }
