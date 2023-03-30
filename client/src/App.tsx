import { useEffect, useState } from "react";

function App() {
  const [text, setText] = useState("");
  useEffect(() => {
    fetch("/api")
      .then((res) => res.text())
      .then(setText);
  });

  return (
    <div>
      hello from vite
      <br />
      text: {text}
    </div>
  );
}

export default App;
