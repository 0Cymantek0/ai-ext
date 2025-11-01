/**
 * Konami Code Listener
 * Detects the classic Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
 * Triggers the hidden Zork game when sequence is entered
 */

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

export class KonamiCodeListener {
  private sequence: string[] = [];
  private callback: () => void;
  private isActive = false;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    document.addEventListener('keydown', this.handleKeyPress);
  }

  stop(): void {
    this.isActive = false;
    document.removeEventListener('keydown', this.handleKeyPress);
  }

  private handleKeyPress = (event: KeyboardEvent): void => {
    // Add the key to sequence
    this.sequence.push(event.code);

    // Keep only the last 10 keys
    if (this.sequence.length > KONAMI_CODE.length) {
      this.sequence.shift();
    }

    // Check if sequence matches Konami code
    if (this.isKonamiCode()) {
      this.callback();
      this.sequence = []; // Reset after successful trigger
    }
  };

  private isKonamiCode(): boolean {
    if (this.sequence.length !== KONAMI_CODE.length) {
      return false;
    }

    return this.sequence.every((key, index) => key === KONAMI_CODE[index]);
  }

  reset(): void {
    this.sequence = [];
  }
}

// Singleton instance for global use
let konamiListener: KonamiCodeListener | null = null;

export function initKonamiCode(callback: () => void): void {
  if (konamiListener) {
    konamiListener.stop();
  }
  konamiListener = new KonamiCodeListener(callback);
  konamiListener.start();
}

export function stopKonamiCode(): void {
  if (konamiListener) {
    konamiListener.stop();
    konamiListener = null;
  }
}
