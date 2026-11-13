import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes.js';
import { authInterceptor } from './core/auth/auth.interceptor.js';
import { resilientHttpInterceptor } from './core/http/resilient-http.interceptor.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, resilientHttpInterceptor]))
  ]
};
