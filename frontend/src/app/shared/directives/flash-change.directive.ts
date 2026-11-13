import { Directive, ElementRef, Input, OnChanges, SimpleChanges, inject, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appFlashChange]',
  standalone: true
})
export class FlashChangeDirective implements OnChanges {
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);

  @Input() appFlashChange: string | number | undefined;

  private isFirstChange = true;
  private timeoutId: any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appFlashChange']) {
      if (this.isFirstChange) {
        this.isFirstChange = false;
        return;
      }

      const prev = changes['appFlashChange'].previousValue;
      const curr = changes['appFlashChange'].currentValue;

      if (prev !== curr) {
        this.triggerFlash();
      }
    }
  }

  private triggerFlash(): void {
    const nativeEl = this.el.nativeElement;
    this.renderer.removeClass(nativeEl, 'status-flashing');
    void nativeEl.offsetWidth; // Force CSS reflow
    this.renderer.addClass(nativeEl, 'status-flashing');

    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.renderer.removeClass(nativeEl, 'status-flashing');
    }, 700);
  }
}
