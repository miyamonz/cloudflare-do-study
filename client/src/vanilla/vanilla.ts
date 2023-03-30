let currentWebSocket: WebSocket | null = null;

let roomForm = document.querySelector("#room-form");
let roomNameInput = document.querySelector("#room-name");
let goPublicButton = document.querySelector("#go-public");
let goPrivateButton = document.querySelector("#go-private");
let chatroom = document.querySelector("#chatroom");
let chatlog = document.querySelector("#chatlog");
let chatInput = document.querySelector("#chat-input");
let roster = document.querySelector("#roster");

// Is the chatlog scrolled to the bottom?
let isAtBottom = true;

let username;
let roomname;

let hostname = window.location.host;
if (hostname == "") {
  // Probably testing the HTML locally.
  hostname = "edge-chat-demo.cloudflareworkers.com";
}

function startChat() {
  roomForm.remove();

  // Normalize the room name a bit.
  roomname = roomname
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/_/g, "-")
    .toLowerCase();

  if (roomname.length > 32 && !roomname.match(/^[0-9a-f]{64}$/)) {
    addChatMessage("ERROR", "Invalid room name.");
    return;
  }

  document.location.hash = "#" + roomname;

  chatInput.addEventListener("keydown", (event) => {
    if (event.keyCode == 38) {
      // up arrow
      chatlog.scrollBy(0, -50);
    } else if (event.keyCode == 40) {
      // down arrow
      chatlog.scrollBy(0, 50);
    } else if (event.keyCode == 33) {
      // page up
      chatlog.scrollBy(0, -chatlog.clientHeight + 50);
    } else if (event.keyCode == 34) {
      // page down
      chatlog.scrollBy(0, chatlog.clientHeight - 50);
    }
  });

  chatroom.addEventListener("submit", (event) => {
    event.preventDefault();

    if (currentWebSocket) {
      currentWebSocket.send(JSON.stringify({ message: chatInput.value }));
      chatInput.value = "";

      // Scroll to bottom whenever sending a message.
      chatlog.scrollBy(0, 1e8);
    }
  });

  chatInput.addEventListener("input", (event) => {
    if (event.currentTarget.value.length > 256) {
      event.currentTarget.value = event.currentTarget.value.slice(0, 256);
    }
  });

  chatlog.addEventListener("scroll", (event) => {
    isAtBottom =
      chatlog.scrollTop + chatlog.clientHeight >= chatlog.scrollHeight;
  });

  chatInput.focus();
  document.body.addEventListener("click", (event) => {
    // If the user clicked somewhere in the window without selecting any text, focus the chat
    // input.
    if (window.getSelection().toString() == "") {
      chatInput.focus();
    }
  });

  // Detect mobile keyboard appearing and disappearing, and adjust the scroll as appropriate.
  if ("visualViewport" in window) {
    window.visualViewport.addEventListener("resize", function (event) {
      if (isAtBottom) {
        chatlog.scrollBy(0, 1e8);
      }
    });
  }

  join();
}

let lastSeenTimestamp = 0;
let wroteWelcomeMessages = false;

function addChatMessage(name, text) {
  let p = document.createElement("p");
  if (name) {
    let tag = document.createElement("span");
    tag.className = "username";
    tag.innerText = name + ": ";
    p.appendChild(tag);
  }
  p.appendChild(document.createTextNode(text));

  // Append the new chat line, making sure that if the chatlog was scrolled to the bottom
  // before, it remains scrolled to the bottom, and otherwise the scroll position doesn't
  // change.
  chatlog.appendChild(p);
  if (isAtBottom) {
    chatlog.scrollBy(0, 1e8);
  }
}

startNameChooser();
