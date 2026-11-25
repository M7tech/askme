import { $, esc, icon, uid } from "./shared.js";
import { tr } from "./locale.js";
import { mark } from "./room.js";

/** Optional selfie step. Nothing is captured until consent is switched on. */
function selfieStep() {
  const id = uid("selfie");
  return `<fieldset class="selfie" id="selfie"><legend>${esc(tr("selfie"))}</legend><p class="hint">${esc(tr("selfieHint"))}</p><label class="check"><input type="checkbox" name="consent" id="selfie-consent"><span>${esc(tr("consent"))}</span></label><div class="selfie-body" hidden><div class="viewfinder" id="viewfinder">${mark(0)}<video playsinline muted hidden></video><img alt="${esc(tr("selfiePreview"))}" hidden></div><div class="actions"><button type="button" class="primary" data-selfie="open">${icon("camera")}<span>${esc(tr("selfieTake"))}</span></button><button type="button" class="primary" data-selfie="shoot" hidden>${icon("camera")}<span>${esc(tr("selfieShoot"))}</span></button><button type="button" data-selfie="retake" hidden>${icon("undo")}<span>${esc(tr("selfieRetake"))}</span></button><button type="button" class="quiet danger" data-selfie="remove" hidden>${icon("trash")}<span>${esc(tr("selfieRemove"))}</span></button><label class="button" for="${id}">${icon("image")}<span>${esc(tr("selfieChoose"))}</span></label><input class="sr" type="file" id="${id}" accept="image/jpeg,image/png,image/webp" capture="user"></div><p class="hint" id="selfie-status" role="status"></p></div></fieldset>`;
}
/** Wires the step. Returns the chosen photo and a way to release the camera. */
function bindSelfie() {
  const root = $("#selfie");
  if (!root) return { photo: () => null, stop() {} };
  const body = root.querySelector(".selfie-body"),
    video = root.querySelector("video"),
    img = root.querySelector("img"),
    glyph = root.querySelector(".mark"),
    file = root.querySelector("input[type=file]"),
    consent = root.querySelector("#selfie-consent"),
    status = root.querySelector("#selfie-status"),
    button = (name) => root.querySelector(`[data-selfie="${name}"]`);
  let stream = null,
    photo = null,
    url = "",
    closed = false;
  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  };
  const show = (state) => {
    video.hidden = state !== "live";
    img.hidden = state !== "done";
    glyph.toggleAttribute("hidden", state !== "idle");
    button("open").hidden = state !== "idle";
    button("shoot").hidden = state !== "live";
    button("retake").hidden = state !== "done";
    button("remove").hidden = state !== "done";
    root.querySelector("label.button").hidden = file.hidden = state === "done";
    if (state !== "live") stop();
  };
  const drop = () => {
    photo = null;
    file.value = "";
    URL.revokeObjectURL(url);
    img.removeAttribute("src");
    show("idle");
  };
  const keep = (blob) => {
    photo = blob;
    URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    img.src = url;
    status.textContent = tr("selfieReady");
    show("done");
  };
  // A square crop at 960px is ample for identification and stays small.
  const square = (source, width, height) =>
    new Promise((resolve, reject) => {
      const side = Math.min(width, height),
        size = Math.min(960, side),
        canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas
        .getContext("2d")
        .drawImage(
          source,
          (width - side) / 2,
          (height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size,
        );
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error(tr("selfieFailed")))),
        "image/jpeg",
        0.88,
      );
    });
  const open = async () => {
    status.textContent = "";
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
      });
      // The student may have left or withdrawn consent while being asked.
      if (closed || !consent.checked) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      video.srcObject = next;
      // The shutter waits for the first frame.
      button("shoot").disabled = true;
      show("live");
      await video.play();
      if (!video.videoWidth)
        await new Promise((ready) =>
          video.addEventListener("loadeddata", ready, { once: true }),
        );
      button("shoot").disabled = false;
      button("shoot").focus();
    } catch {
      show("idle");
      status.textContent = tr("selfieBlocked");
    }
  };
  consent.onchange = () => {
    body.hidden = !consent.checked;
    if (!consent.checked) {
      status.textContent = "";
      drop();
    }
  };
  button("open").onclick = open;
  button("retake").onclick = () => {
    drop();
    open();
  };
  button("remove").onclick = () => {
    drop();
    status.textContent = "";
    button("open").focus();
  };
  button("shoot").onclick = async () => {
    try {
      keep(await square(video, video.videoWidth, video.videoHeight));
      button("retake").focus();
    } catch {
      status.textContent = tr("selfieFailed");
    }
  };
  file.onchange = async () => {
    if (!file.files[0]) return;
    try {
      const bitmap = await createImageBitmap(file.files[0], {
        imageOrientation: "from-image",
      });
      keep(await square(bitmap, bitmap.width, bitmap.height));
      bitmap.close();
    } catch {
      drop();
      status.textContent = tr("selfieFailed");
    }
  };
  return {
    photo: () => (consent.checked ? photo : null),
    stop() {
      closed = true;
      stop();
      URL.revokeObjectURL(url);
    },
  };
}
export { selfieStep, bindSelfie };
