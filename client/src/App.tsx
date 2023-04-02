import { useEffect, useRef, useState } from "react";
import { atom, getDefaultStore, useAtom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";

async function connectWebsocket(name: string) {
  const roomName = "main";
  const wss = document.location.protocol === "http:" ? "ws://" : "wss://";
  const hostname = window.location.host;

  const ws = new WebSocket(
    wss + hostname + "/api/room/" + roomName + "/websocket"
  );
  const openPromise = new Promise<WebSocket>((resolve) => {
    ws.addEventListener("open", () => {
      resolve(ws);
    });
  });
  ws.onclose = () => {
    console.log("closed");
  };
  return openPromise;
}

const nameAtom = atom("");
const nameCacheAtom = atomWithStorage("name", "");

const connectionAtom = atom(null as WebSocket | null);

const stateAtom = atom("name" as "name" | "room");

function App() {
  const [state, setState] = useAtom(stateAtom);

  if (state === "name") {
    return <InputName />;
  } else if (state === "room") {
    return <Room />;
  }
  return null;
}

function nameFromLocalStorage() {
  const n = window.localStorage.getItem("name");
  return (n && JSON.parse(n)) ?? "";
}
function InputName() {
  const [, setName] = useAtom(nameAtom);
  const [, setNameCache] = useAtom(nameCacheAtom);
  const [text, setText] = useState(nameFromLocalStorage());
  const [, setWs] = useAtom(connectionAtom);
  const [, setState] = useAtom(stateAtom);

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button
        onClick={() => {
          setText("");
          setName(text);
          setNameCache(text);
          connectWebsocket(text).then((ws) => {
            setWs(ws);
          });
          setState("room");
        }}
      >
        connect
      </button>
    </div>
  );
}

const canvasContextAtom = atom(null as CanvasRenderingContext2D | null);
const downAtom = atom(false);
const mousePosAtom = atom({ x: 0, y: 0 });

const randomColor = () => {
  // #000000 ~ #ffffff
  const hex = Math.floor(Math.random() * 0xffffff).toString(16);
  return "#" + ("000000" + hex).slice(-6);
};
const colorAtom = atom(randomColor());
const store = getDefaultStore();
function draw(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  color = "#000000"
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI);
  ctx.fill();
}
store.sub(mousePosAtom, () => {
  const ctx = store.get(canvasContextAtom);
  const isDown = store.get(downAtom);
  const { x, y } = store.get(mousePosAtom);
  const color = store.get(colorAtom);
  // draw
  if (ctx && isDown) {
    draw(ctx, { x, y }, color);
  }

  //ws
  const name = store.get(nameAtom);
  const ws = store.get(connectionAtom);
  if (ws) {
    ws.send(
      JSON.stringify({ type: "mousePos", name, pos: { x, y }, isDown, color })
    );
  }
});

const membersAtom = atom([] as string[]);
type MemberData = {
  pos: { x: number; y: number };
  isDown: boolean;
  color: string;
};
const memberFamily = atomFamily((name: string) => {
  return atom({ pos: { x: 0, y: 0 }, isDown: false, color: "#000000" });
});
const memberDataRecordAtom = atom((get) => {
  const members = get(membersAtom);
  const record = members.reduce((acc, name) => {
    acc[name] = get(memberFamily(name));
    return acc;
  }, {} as Record<string, MemberData>);
  return record;
});

// update state when data comes from ws
store.sub(connectionAtom, () => {
  const ws = store.get(connectionAtom);
  if (ws) {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // console.log("onmessage", data);
      const joined = data.joined;
      if (typeof joined === "string" && joined !== store.get(nameAtom)) {
        store.set(membersAtom, (members) => [...members, joined]);
      }
      const quit = data.quit;
      if (typeof quit === "string") {
        store.set(membersAtom, (members) => members.filter((m) => m !== quit));
      }
      if (data.type === "mousePos") {
        store.set(memberFamily(data.name), data);

        const ctx = store.get(canvasContextAtom);
        if (ctx && data.isDown) {
          draw(ctx, data.pos, data.color);
        }
      }
    };
  }
});

function Room() {
  const [name] = useAtom(nameAtom);
  const [members] = useAtom(membersAtom);
  const [memberRecord] = useAtom(memberDataRecordAtom);

  const ref = useRef<HTMLCanvasElement>(null);
  const [, setContext] = useAtom(canvasContextAtom);
  useEffect(() => {
    if (ref.current) {
      const ctx = ref.current.getContext("2d");
      if (ctx) {
        setContext(ctx);
      }
    }
  }, [ref, setContext]);
  const [, setDown] = useAtom(downAtom);

  const [, setMousePos] = useAtom(mousePosAtom);
  const [color, setColor] = useAtom(colorAtom);
  return (
    <div>
      <div>name: {name}</div>
      <div>members: {members.join(", ")}</div>
      <input
        type="color"
        value={color}
        onChange={(e) => {
          setColor(e.target.value);
        }}
      />
      <br />
      <div style={{ position: "relative" }}>
        <canvas
          ref={ref}
          onMouseDown={() => setDown(true)}
          onMouseUp={() => setDown(false)}
          onMouseMove={(e) => {
            if (!ref.current) return;
            const rect = ref.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setMousePos({ x, y });
          }}
          width="800"
          height="800"
          style={{ border: "solid 1px" }}
        />
        {Object.entries(memberRecord).map(([name, data]) => {
          return (
            <div
              key={name}
              style={{
                position: "absolute",
                color: data.color,
                left: data.pos.x,
                top: data.pos.y,
                fontWeight: data.isDown ? "bold" : "normal",
              }}
            >
              <Cursor />
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
const Cursor = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M13.64 21.97a.99.99 0 0 1-1.33-.47l-2.18-4.74l-2.51 2.02c-.17.14-.38.22-.62.22a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1c.24 0 .47.09.64.23l.01-.01l11.49 9.64a1.001 1.001 0 0 1-.44 1.75l-3.16.62l2.2 4.73c.26.5.02 1.09-.48 1.32l-3.62 1.69Z"
    />
  </svg>
);

export default App;
