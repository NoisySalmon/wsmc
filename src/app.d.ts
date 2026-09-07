// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Principal } from '$lib/server/auth/capabilities';

declare global {
	namespace App {
		interface Error {
			message: string;
			requestId?: string;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				EMAIL_API_KEY?: string;
				EMAIL_FROM?: string;
				APP_ORIGIN?: string;
			};
		}
		interface Locals {
			principal: Principal | null;
			sessionId: string | null;
		}
	}
}

export {};
