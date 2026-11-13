import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service.js';
import { Role } from '../../core/models/auth.model.js';

@Directive({
  selector: '[appHasRole]',
  standalone: true
})
export class HasRoleDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService);

  private expectedRole: Role | null = null;
  private hasView = false;

  @Input() set appHasRole(role: Role) {
    this.expectedRole = role;
    this.updateView();
  }

  constructor() {
    effect(() => {
      // Re-evaluate whenever user or role changes
      this.authService.currentUser();
      this.updateView();
    });
  }

  private updateView() {
    const user = this.authService.currentUser();
    const canShow = user && this.expectedRole ? user.role === this.expectedRole : false;

    if (canShow && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!canShow && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
