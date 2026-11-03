// Configures Monaco to load its language workers from local bundled files
// instead of `@monaco-editor/react`'s default CDN loader - keeps the editor
// fully self-contained and offline-capable. Uses the `new URL(...,
// import.meta.url)` worker syntax (Vite's other supported worker-import
// form) rather than the `?worker` query suffix, which Rolldown-based Vite
// fails to resolve for monaco-editor's deep package subpaths.
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    const workerUrl =
      label === 'json'
        ? new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url)
        : label === 'css' || label === 'scss' || label === 'less'
          ? new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url)
          : label === 'html' || label === 'handlebars' || label === 'razor'
            ? new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url)
            : label === 'typescript' || label === 'javascript'
              ? new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url)
              : new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url)

    return new Worker(workerUrl, { type: 'module' })
  },
}

loader.config({ monaco })
