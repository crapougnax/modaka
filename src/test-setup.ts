import { vi } from 'vitest';

// Polyfill window.speechSynthesis
if (typeof window !== 'undefined') {
   Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
         cancel: vi.fn(),
         speak: vi.fn(),
         pause: vi.fn(),
         resume: vi.fn(),
         getVoices: () => []
      }
   });

   Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
         matches: false,
         media: query,
         onchange: null,
         addListener: vi.fn(),
         removeListener: vi.fn(),
         addEventListener: vi.fn(),
         removeEventListener: vi.fn(),
         dispatchEvent: vi.fn(),
      }))
   });

   if (!HTMLCanvasElement.prototype.getContext) {
      HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
         fillRect: vi.fn(),
         clearRect: vi.fn(),
         getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
         putImageData: vi.fn(),
         createImageData: vi.fn(),
         setTransform: vi.fn(),
         drawImage: vi.fn(),
         save: vi.fn(),
         fillText: vi.fn(),
         restore: vi.fn(),
         beginPath: vi.fn(),
         moveTo: vi.fn(),
         lineTo: vi.fn(),
         closePath: vi.fn(),
         stroke: vi.fn(),
         translate: vi.fn(),
         scale: vi.fn(),
         rotate: vi.fn(),
         arc: vi.fn(),
         fill: vi.fn(),
         measureText: vi.fn().mockReturnValue({ width: 0 }),
         transform: vi.fn(),
         rect: vi.fn(),
         clip: vi.fn()
      })) as any;
   }
}
