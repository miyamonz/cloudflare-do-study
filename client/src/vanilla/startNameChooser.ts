let nameForm = document.querySelector("#name-form") as HTMLFormElement;
let nameInput = document.querySelector("#name-input") as HTMLInputElement;

export function startNameChooser() {
  nameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    username = nameInput.value;
    if (username.length > 0) {
      startRoomChooser();
    }
  });
  nameInput.addEventListener("input", (event) => {
    if (event.currentTarget.value.length > 32) {
      event.currentTarget.value = event.currentTarget.value.slice(0, 32);
    }
  });

  nameInput.focus();
}

let roomForm = document.querySelector("#room-form") as HTMLFormElement;
let roomNameInput = document.querySelector("#room-name") as HTMLInputElement;
export function startRoomChooser() {
  nameForm.remove();

  if (document.location.hash.length > 1) {
    roomname = document.location.hash.slice(1);
    startChat();
    return;
  }

  roomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    roomname = roomNameInput.value;
    if (roomname.length > 0) {
      startChat();
    }
  });

  roomNameInput.addEventListener("input", (event) => {
    if (event.currentTarget.value.length > 32) {
      event.currentTarget.value = event.currentTarget.value.slice(0, 32);
    }
  });

  goPublicButton.addEventListener("click", (event) => {
    roomname = roomNameInput.value;
    if (roomname.length > 0) {
      startChat();
    }
  });

  goPrivateButton.addEventListener("click", async (event) => {
    roomNameInput.disabled = true;
    goPublicButton.disabled = true;
    event.currentTarget.disabled = true;

    let response = await fetch("https://" + hostname + "/api/room", {
      method: "POST",
    });
    if (!response.ok) {
      alert("something went wrong");
      document.location.reload();
      return;
    }

    roomname = await response.text();
    startChat();
  });

  roomNameInput.focus();
}
