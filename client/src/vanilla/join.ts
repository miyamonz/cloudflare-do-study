function join() {
  // If we are running via wrangler dev, use ws:
  const wss = document.location.protocol === "http:" ? "ws://" : "wss://";
  let ws = new WebSocket(
    wss + hostname + "/api/room/" + roomname + "/websocket"
  );
  let rejoined = false;
  let startTime = Date.now();

  let rejoin = async () => {
    if (!rejoined) {
      rejoined = true;
      currentWebSocket = null;

      // Clear the roster.
      while (roster.firstChild) {
        roster.removeChild(roster.firstChild);
      }

      // Don't try to reconnect too rapidly.
      let timeSinceLastJoin = Date.now() - startTime;
      if (timeSinceLastJoin < 10000) {
        // Less than 10 seconds elapsed since last join. Pause a bit.
        await new Promise((resolve) =>
          setTimeout(resolve, 10000 - timeSinceLastJoin)
        );
      }

      // OK, reconnect now!
      join();
    }
  };

  ws.addEventListener("open", (event) => {
    currentWebSocket = ws;

    // Send user info message.
    ws.send(JSON.stringify({ name: username }));
  });

  ws.addEventListener("message", (event) => {
    let data = JSON.parse(event.data);

    if (data.error) {
      addChatMessage(null, "* Error: " + data.error);
    } else if (data.joined) {
      let p = document.createElement("p");
      p.innerText = data.joined;
      roster.appendChild(p);
    } else if (data.quit) {
      for (let child of roster.childNodes) {
        if (child.innerText == data.quit) {
          roster.removeChild(child);
          break;
        }
      }
    } else if (data.ready) {
      // All pre-join messages have been delivered.
      if (!wroteWelcomeMessages) {
        wroteWelcomeMessages = true;
        addChatMessage(
          null,
          "* This is a demo app built with Cloudflare Workers Durable Objects. The source code " +
            "can be found at: https://github.com/cloudflare/workers-chat-demo"
        );
        addChatMessage(
          null,
          "* WARNING: Participants in this chat are random people on the internet. " +
            "Names are not authenticated; anyone can pretend to be anyone. The people " +
            "you are chatting with are NOT Cloudflare employees. Chat history is saved."
        );
        if (roomname.length == 64) {
          addChatMessage(
            null,
            "* This is a private room. You can invite someone to the room by sending them the URL."
          );
        } else {
          addChatMessage(null, "* Welcome to #" + roomname + ". Say hi!");
        }
      }
    } else {
      // A regular chat message.
      if (data.timestamp > lastSeenTimestamp) {
        addChatMessage(data.name, data.message);
        lastSeenTimestamp = data.timestamp;
      }
    }
  });

  ws.addEventListener("close", (event) => {
    console.log("WebSocket closed, reconnecting:", event.code, event.reason);
    rejoin();
  });
  ws.addEventListener("error", (event) => {
    console.log("WebSocket error, reconnecting:", event);
    rejoin();
  });
}
