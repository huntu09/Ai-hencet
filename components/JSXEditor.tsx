"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as Babel from "@babel/standalone";

// Helper to beautify code (optional, use prettier/standalone if needed)
function beautify(code: string) {
  return code.replace(/({|;)/g, "$1\n").replace(/\n\s*\n/g, "\n").replace(/^\s+/gm, "  ");
}

type ProjectFiles = { [filename: string]: string };

const EXAMPLES: { [name: string]: ProjectFiles } = {
  "Counter": {
    "App.jsx": `function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}`,
  },
  "Todo List": {
    "App.jsx": `function App() {
  const [todos, setTodos] = React.useState([]);
  const [text, setText] = React.useState("");
  return (
    <div>
      <h2>Todo List</h2>
      <form onSubmit={e => {e.preventDefault(); setTodos([...todos, text]); setText("");}}>
        <input value={text} onChange={e => setText(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((todo, idx) => <li key={idx}>{todo}</li>)}
      </ul>
    </div>
  );
}`,
    "utils.js": `// Helper for Todo (dummy example)
export function greet(name) {
  return "Hello " + name;
}`
  },
  "Styled Button": {
    "App.jsx": `function App() {
  return (
    <button style={{ background: "rebeccapurple", color: "white", fontSize: 24, padding: 12, borderRadius: 8 }}>
      Beautiful Button
    </button>
  );
}`,
  }
};

const DEFAULT_FILES: ProjectFiles = {
  "App.jsx": `function App() {
  return <h1>Hello JSX!</h1>;
}`,
};

const LOCAL_KEY = "jsxeditor_project_v2";

export default function JSXEditor() {
  // Multi-file state
  const [files, setFiles] = useState<ProjectFiles>(() => {
    if (typeof window === "undefined") return DEFAULT_FILES;
    try {
      const saved = window.localStorage.getItem(LOCAL_KEY);
      if (saved) return JSON.parse(saved);
      return DEFAULT_FILES;
    } catch {
      return DEFAULT_FILES;
    }
  });
  const [activeFile, setActiveFile] = useState<string>(() => Object.keys(DEFAULT_FILES)[0]);
  const [compiled, setCompiled] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [autoRun, setAutoRun] = useState<boolean>(true);

  // Project save/load
  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(files));
  }, [files]);

  // Compile on file/code change
  useEffect(() => {
    if (autoRun) compile();
    // eslint-disable-next-line
  }, [files, activeFile, autoRun]);

  // Multi-file Babel compile
  function compile() {
    // Reset error and logs
    setError(null);
    setConsoleLogs([]);
    try {
      // Babel: Concatenate all files, but App.jsx is always last (entry)
      const fileOrder = Object.keys(files).filter(f => f !== "App.jsx").concat("App.jsx");
      let userCode = fileOrder.map(f => files[f]).join("\n\n");

      // Entry point
      const entry = `
        ReactDOM.createRoot(document.getElementById('root')).render(<App />);
      `;

      // Custom console bridge
      const consoleBridge = `
        window.parent.postMessage(
          { source: "iframe-console", logs: [].slice.call(arguments).map(String).join(" ") },
          "*"
        );
      `;
      const hijackConsole = `
        (function(){
          var origLog = console.log;
          console.log = function() {
            origLog.apply(console, arguments);
            ${consoleBridge}
          }
        })();
      `;

      const result = Babel.transform(
        hijackConsole + "\n" + userCode + "\n" + entry,
        { presets: ["react"] }
      ).code;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
          <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        </head>
        <body>
          <div id="root"></div>
          <script>
            window.addEventListener("message", function(e){
              if(e.data && e.data.type === "request-logs"){ 
                window.parent.postMessage({source: "iframe-console", logs: "Console Ready"}, "*");
              }
            });
          </script>
          <script type="text/javascript">${result}</script>
        </body>
        </html>
      `;
      setCompiled(html);
    } catch (e: any) {
      setCompiled("");
      setError(e?.message || String(e));
    }
  }

  // Receive console logs from iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.source === "iframe-console" && typeof e.data.logs === "string") {
        setConsoleLogs(logs => [...logs, e.data.logs]);
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // File ops
  function handleFileChange(val: string) {
    setFiles(f => ({ ...f, [activeFile]: val }));
  }
  function handleAddFile() {
    let newName = prompt("File name? (e.g. utils.js, Helper.jsx)");
    if (!newName) return;
    if (!/^[\w\-]+\.(jsx?|tsx?)$/.test(newName)) {
      alert("Invalid file name");
      return;
    }
    if (files[newName]) {
      alert("File already exists");
      return;
    }
    setFiles(f => ({ ...f, [newName]: "// New file" }));
    setActiveFile(newName);
  }
  function handleDeleteFile(filename: string) {
    if (filename === "App.jsx") return alert("Cannot delete entry file");
    const { [filename]: _, ...rest } = files;
    setFiles(rest);
    setActiveFile("App.jsx");
  }
  function handleRenameFile(filename: string) {
    let newName = prompt("Rename file to:", filename);
    if (!newName || newName === filename) return;
    if (!/^[\w\-]+\.(jsx?|tsx?)$/.test(newName)) {
      alert("Invalid file name");
      return;
    }
    if (files[newName]) {
      alert("File already exists");
      return;
    }
    setFiles(f => {
      const { [filename]: val, ...rest } = f;
      return { ...rest, [newName]: val };
    });
    setActiveFile(newName);
  }
  function handleDownload() {
    const blob = new Blob([files[activeFile]], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }

  // Save/load project
  function saveProject() {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(files));
    alert("Project saved!");
  }
  function loadProject() {
    const saved = window.localStorage.getItem(LOCAL_KEY);
    if (saved) setFiles(JSON.parse(saved));
    else alert("No saved project!");
  }
  function clearProject() {
    if (confirm("Reset all files to default?")) setFiles(DEFAULT_FILES);
  }

  // Examples
  function handleExample(name: string) {
    setFiles(EXAMPLES[name]);
    setActiveFile("App.jsx");
  }

  // Beautify
  function handleBeautify() {
    setFiles(f => ({ ...f, [activeFile]: beautify(f[activeFile]) }));
  }

  // Manual run
  function handleRun() {
    compile();
  }

  return (
    <main className="p-4 max-w-6xl mx-auto w-full">
      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="grid grid-cols-5 mb-4">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="project">Project</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        {/* Editor Tab */}
        <TabsContent value="editor">
          <Card className="rounded-2xl shadow-lg overflow-hidden">
            <CardContent className="p-4">
              <div className="flex mb-2 gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleAddFile}>+ File</Button>
                <Button variant="outline" size="sm" onClick={handleBeautify}>Beautify</Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>Download</Button>
                <Button variant="outline" size="sm" onClick={handleRun}>Run</Button>
                <label className="flex items-center gap-1 text-xs ml-4">
                  <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} />
                  Auto Run
                </label>
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                {Object.keys(files).map(f => (
                  <span
                    key={f}
                    className={`px-2 py-1 rounded cursor-pointer ${f === activeFile ? "bg-blue-200 font-bold" : "bg-gray-100"}`}
                    onClick={() => setActiveFile(f)}
                  >
                    {f}
                    {f !== "App.jsx" && (
                      <>
                        {" "}
                        <span
                          title="Rename"
                          className="text-xs text-blue-500 cursor-pointer"
                          onClick={e => { e.stopPropagation(); handleRenameFile(f); }}
                        >✏️</span>
                        <span
                          title="Delete"
                          className="text-xs text-red-400 ml-1 cursor-pointer"
                          onClick={e => { e.stopPropagation(); handleDeleteFile(f); }}
                        >❌</span>
                      </>
                    )}
                  </span>
                ))}
              </div>
              <Textarea
                className="min-h-[300px] font-mono text-sm resize-none"
                spellCheck={false}
                value={files[activeFile]}
                onChange={(e) => handleFileChange(e.target.value)}
              />
              {error && (
                <pre className="text-red-600 text-xs mt-2 bg-red-50 p-2 rounded">{error}</pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview">
          <Card className="rounded-2xl shadow-lg overflow-hidden">
            <CardContent className="p-0 h-[500px]">
              <iframe
                title="JSX Preview"
                className="w-full h-full border-none"
                srcDoc={compiled}
                sandbox="allow-scripts"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console">
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-4">
              <div className="bg-black text-green-400 font-mono text-sm rounded p-2 h-72 overflow-auto">
                {consoleLogs.length === 0 && <div className="text-gray-500">No console logs yet.</div>}
                {consoleLogs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setConsoleLogs([])}
              >
                Clear Console
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Tab */}
        <TabsContent value="project">
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-4 space-y-4">
              <Button variant="outline" size="sm" onClick={saveProject}>💾 Save Project</Button>
              <Button variant="outline" size="sm" onClick={loadProject}>📂 Load Project</Button>
              <Button variant="outline" size="sm" onClick={clearProject}>🗑️ Reset Project</Button>
              <div className="text-xs text-gray-500">
                Project is auto-saved. You can also manually save or restore.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Examples Tab */}
        <TabsContent value="examples">
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex gap-4 mb-4 flex-wrap">
                {Object.keys(EXAMPLES).map(name => (
                  <Button key={name} size="sm" variant="outline" onClick={() => handleExample(name)}>
                    {name}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-gray-500">
                Click an example to load it into the project (will overwrite current files).
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
  }
