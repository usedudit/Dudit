/**
 * Barcode and scanning utility functions.
 */

/**
 * Auto-detects the barcode format based on the string value.
 * Supporting: EAN-13, EAN-8, UPC-A/E, and CODE128.
 */
export function detectBarcodeFormat(value: string): "EAN13" | "EAN8" | "UPC" | "CODE128" {
  if (!value) return "CODE128";
  
  const numericOnly = /^\d+$/.test(value);
  if (numericOnly) {
    if (value.length === 13) return "EAN13";
    if (value.length === 8) return "EAN8";
    if (value.length === 12) return "UPC";
  }
  
  return "CODE128";
}

/**
 * Generates a valid internal EAN-13 barcode starting with '20' (restricted for internal retail use).
 * Automatically calculates the correct EAN-13 checksum digit.
 */
export function generateEAN13(): string {
  // Generate a number starting with '20' (in-store internal use prefix)
  let code = "20";
  for (let i = 0; i < 10; i++) {
    code += Math.floor(Math.random() * 10);
  }
  
  // Calculate EAN-13 check digit (weight 1 and 3)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return code + checkDigit;
}

/**
 * Plays a quick retail-like scanner beep sound using the browser's Web Audio API.
 * This is serverless-compatible and does not require static audio file assets.
 */
export function playBeepSound() {
  if (typeof window === "undefined") return;
  
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = "sine";
    oscillator.frequency.value = 1200; // High pitch crisp retail beep tone
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.02); // volume ramp up
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12); // volume decay

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.12);
  } catch (error) {
    console.warn("Web Audio API beep failed or was blocked by browser policy:", error);
  }
}

/**
 * Vibrates the mobile device for 80 milliseconds if supported.
 */
export function vibrateMobile() {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(80);
    } catch (e) {
      console.warn("Mobile vibration failed:", e);
    }
  }
}
