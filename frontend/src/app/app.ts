import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { AuthService } from './core/auth/auth.service.js';
import { HasRoleDirective } from './shared/directives/has-role.directive.js';
import { ConnectionStatusComponent } from './shared/components/connection-status/connection-status.component.js';
import { IncidentPanelComponent } from './shared/components/incident-panel/incident-panel.component.js';
import { StreamPipelineService } from './core/stream/stream-pipeline.service.js';
import { RuleEvaluatorService } from './features/rules/rule-evaluator.service.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    HasRoleDirective,
    ConnectionStatusComponent,
    IncidentPanelComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  public authService = inject(AuthService);
  public pipeline = inject(StreamPipelineService);
  private evaluator = inject(RuleEvaluatorService);

  ngOnInit(): void {
    this.evaluator.init();
  }

  logout(): void {
    this.authService.logout(true);
  }
}
