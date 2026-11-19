import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [NgIf],
  template: `
  <ng-container *ngIf="visible">
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">

        <div class="modal-header">
          <h5 class="modal-title">{{ title }}</h5>
          <button type="button" class="btn-close" aria-label="Close" (click)="cancel()"></button>
        </div>

        <div class="modal-body">
          <p>{{ message }}</p>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" (click)="cancel()">Cancel</button>
          <button type="button" class="btn btn-danger" (click)="confirm()">Confirm</button>
        </div>

      </div>
    </div>
  </div>
  </ng-container>
  `
})
export class ConfirmModalComponent {
  @Input() title = 'Confirm';
  @Input() message = 'Are you sure?';
  @Input() visible = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  confirm() {
    this.confirmed.emit();
    this.visible = false;
  }

  cancel() {
    this.closed.emit();
    this.visible = false;
  }
}
