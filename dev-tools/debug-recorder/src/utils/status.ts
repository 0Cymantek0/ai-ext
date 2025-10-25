import { Interaction } from '../types.js';

export function normalizeStatus(status: Interaction['status']): string {
  switch (status) {
    case 'success':
      return '✅ Success';
    case 'error':
      return '❌ Error';
    case 'warning':
      return '⚠️ Warning';
    case 'pending':
      return '⏳ Pending';
    default:
      return status;
  }
}
