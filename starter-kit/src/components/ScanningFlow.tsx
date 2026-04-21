"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CheckCircle2 } from "lucide-react";

// Stability threshold: mean absolute pixel delta per channel across the sample canvas.
// Lower = stricter. Tune between 4–10 depending on desired sensitivity.
const STABLE_THRESHOLD = 6;
// Sample canvas dimensions — small intentionally to keep per-frame cost low.
const SAMPLE_W = 80;
const SAMPLE_H = 60;

type Quality = "moving" | "stable";

type Message = {
  id: string;
  threadId: string;
  content: string;
  sender: "patient" | "dentist";
  createdAt: string;
};

export default function ScanningFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camReady, setCamReady] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [quality, setQuality] = useState<Quality>("moving");
  const [notifyStatus, setNotifyStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageStatus, setMessageStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Off-screen canvas + previous frame pixel buffer for motion diff
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanIdRef = useRef(`scan_${Date.now()}`);
  const threadIdRef = useRef(`thread_${Date.now()}`);
  const hasTriggeredNotifyRef = useRef(false);
  const hasLoadedMessagesRef = useRef(false);

  const VIEWS = [
    { label: "Front View", instruction: "Smile and look straight at the camera." },
    { label: "Left View", instruction: "Turn your head to the left." },
    { label: "Right View", instruction: "Turn your head to the right." },
    { label: "Upper Teeth", instruction: "Tilt your head back and open wide." },
    { label: "Lower Teeth", instruction: "Tilt your head down and open wide." },
  ];

  // Initialize Camera
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCamReady(true);
        }
      } catch (err) {
        console.error("Camera access denied", err);
      }
    }
    startCamera();
  }, []);

  // Motion diff loop — runs only while scanning is active
  useEffect(() => {
    if (currentStep >= 5) return;

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    sampleCanvasRef.current = canvas;
    prevPixelsRef.current = null;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let frameCount = 0;

    function tick() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Sample every 3rd frame (~20fps on a 60fps display) to reduce CPU cost
      frameCount++;
      if (frameCount % 3 === 0) {
        ctx!.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const { data } = ctx!.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

        if (prevPixelsRef.current) {
          let totalDelta = 0;
          const len = data.length;
          for (let i = 0; i < len; i += 4) {
            totalDelta +=
              Math.abs(data[i]     - prevPixelsRef.current[i])     +
              Math.abs(data[i + 1] - prevPixelsRef.current[i + 1]) +
              Math.abs(data[i + 2] - prevPixelsRef.current[i + 2]);
          }
          const meanDelta = totalDelta / (SAMPLE_W * SAMPLE_H * 3);
          setQuality(meanDelta < STABLE_THRESHOLD ? "stable" : "moving");
        }

        prevPixelsRef.current = new Uint8ClampedArray(data);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentStep]);

  // Trigger notification once when scan is fully completed
  useEffect(() => {
    if (currentStep < 5 || hasTriggeredNotifyRef.current) return;

    async function triggerNotification() {
      try {
        hasTriggeredNotifyRef.current = true;
        setNotifyStatus("sending");

        const response = await fetch("/api/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scanId: scanIdRef.current,
            status: "completed",
          }),
        });

        if (!response.ok) {
          setNotifyStatus("error");
          return;
        }

        setNotifyStatus("success");
      } catch (error) {
        console.error("Failed to trigger notification", error);
        setNotifyStatus("error");
      }
    }

    triggerNotification();
  }, [currentStep]);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    setMessageError(null);

    try {
      const response = await fetch(`/api/messaging?threadId=${encodeURIComponent(threadIdRef.current)}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessageError(data?.error ?? "Failed to load message history.");
        return;
      }

      setMessages((data.messages ?? []) as Message[]);
    } catch (error) {
      console.error("Failed to load messages", error);
      setMessageError("Failed to load message history.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep < 5 || hasLoadedMessagesRef.current) return;
    hasLoadedMessagesRef.current = true;
    loadMessages();
  }, [currentStep, loadMessages]);

  const sendMessage = useCallback(async () => {
    const safeContent = messageBody.trim();
    if (!safeContent) {
      setMessageError("Message cannot be empty.");
      return;
    }

    setSendingMessage(true);
    setMessageStatus("sending");
    setMessageError(null);

    try {
      const response = await fetch("/api/messaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          content: safeContent,
          sender: "patient",
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessageError(data?.error ?? "Failed to send message.");
        return;
      }

      setMessageBody("");
      setMessageStatus("sent");
      await loadMessages();
    } catch (error) {
      console.error("Failed to send message", error);
      setMessageError("Failed to send message.");
      setMessageStatus("idle");
    } finally {
      setSendingMessage(false);
    }
  }, [loadMessages, messageBody]);

  const handleCapture = useCallback(() => {
    // Boilerplate logic for capturing a frame from the video feed
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");
      setCapturedImages((prev) => [...prev, dataUrl]);
      setCurrentStep((prev) => prev + 1);
    }
  }, []);

  return (
    <div className="flex flex-col items-center bg-black min-h-screen text-white">
      {/* Header */}
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <span className="text-xs text-zinc-500">Step {currentStep + 1}/5</span>
      </div>

      {/* Main Viewport */}
      <div className="relative w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center">
        {currentStep < 5 ? (
          <>
            {/* Video feed — background layer */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Dark surround outside guide to draw attention inward */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle 36% at 50% 48%, transparent 60%, rgba(0,0,0,0.65) 100%)",
              }}
            />

            {/* Mouth guide circle — color driven by stability */}
            <div
              className={`absolute rounded-full border-2 pointer-events-none transition-colors duration-300 ${
                quality === "stable" ? "border-green-400" : "border-yellow-400"
              }`}
              style={{
                width: "72%",
                height: "72%",
                top: "48%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Quality indicator badge */}
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full bg-black/60 transition-colors duration-300 ${
                  quality === "stable" ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {quality === "stable" ? "Hold still — ready to capture" : "Stabilize your phone"}
              </span>
            </div>

            {/* Step instruction */}
            <div className="absolute bottom-10 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent text-center pointer-events-none">
              <p className="text-sm font-medium text-white">{VIEWS[currentStep].instruction}</p>
            </div>
          </>
        ) : (
          <div className="w-full h-full overflow-y-auto p-6 sm:p-8">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-center">Scan Complete</h2>
            <p className="text-zinc-400 mt-2 text-center">Uploading results...</p>
            <p className="text-xs mt-2 text-zinc-500 text-center">Scan ID: {scanIdRef.current}</p>
            <p className="text-xs mt-1 text-zinc-500 text-center">Thread ID: {threadIdRef.current}</p>
            {notifyStatus === "sending" && <p className="text-xs mt-1 text-zinc-400 text-center">Triggering clinic notification...</p>}
            {notifyStatus === "success" && <p className="text-xs mt-1 text-green-400 text-center">Clinic notification sent.</p>}
            {notifyStatus === "error" && <p className="text-xs mt-1 text-red-400 text-center">Notification failed. Check API/server logs.</p>}

            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <h3 className="text-sm font-semibold">Message your clinic</h3>

              <div className="mt-3 h-44 overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                {loadingMessages && <p className="text-sm text-zinc-400">Loading messages...</p>}
                {!loadingMessages && messages.length === 0 && (
                  <p className="text-sm text-zinc-500">No messages yet. Send the first update to your clinic.</p>
                )}
                {!loadingMessages &&
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${
                        message.sender === "patient"
                          ? "ml-auto bg-blue-600/30 border border-blue-500/40"
                          : "mr-auto bg-zinc-800 border border-zinc-700"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className="text-[10px] text-zinc-400 mt-1">{new Date(message.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
              </div>

              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <input
                  value={messageBody}
                  onChange={(e) => {
                    setMessageBody(e.target.value);
                    if (messageStatus === "sent") {
                      setMessageStatus("idle");
                    }
                  }}
                  placeholder="Write a message to your clinic..."
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={sendingMessage}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {sendingMessage ? "Sending..." : "Send"}
                </button>
              </form>

              {messageStatus === "sending" && <p className="text-xs text-zinc-400 mt-2">Sending message to /api/messaging...</p>}
              {messageStatus === "sent" && <p className="text-xs text-green-400 mt-2">Message sent.</p>}

              {messageError && <p className="text-xs text-red-400 mt-2">{messageError}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-10 w-full flex justify-center">
        {currentStep < 5 && (
          <button
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
          >
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
               <Camera className="text-black" />
            </div>
          </button>
        )}
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 p-4 overflow-x-auto w-full">
        {VIEWS.map((v, i) => (
          <div 
            key={i} 
            className={`w-16 h-20 rounded border-2 shrink-0 ${i === currentStep ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800'}`}
          >
            {capturedImages[i] ? (
               <img src={capturedImages[i]} className="w-full h-full object-cover" />
            ) : (
               <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-700">{i+1}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
