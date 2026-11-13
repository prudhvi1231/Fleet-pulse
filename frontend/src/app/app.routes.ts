import { Routes } from '@angular/router';
import { authGuard, operatorRoleGuard } from './core/auth/auth.guard.js';
import { pendingChangesGuard } from './features/rules/pending-changes.guard.js';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component.js').then((m) => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/fleet/fleet-table.component.js').then((m) => m.FleetTableComponent)
  },
  {
    path: 'services/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/service-detail/service-detail.component.js').then((m) => m.ServiceDetailComponent)
  },
  {
    path: 'rules',
    canActivate: [authGuard, operatorRoleGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/rules/rule-list.component.js').then((m) => m.RuleListComponent)
      },
      {
        path: 'new',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/rules/rule-form.component.js').then((m) => m.RuleFormComponent)
      },
      {
        path: ':id/edit',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/rules/rule-form.component.js').then((m) => m.RuleFormComponent)
      }
    ]
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings.component.js').then((m) => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
