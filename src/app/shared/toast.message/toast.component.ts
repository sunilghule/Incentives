import { Component } from '@angular/core';
import { ToastService } from './toast.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgIf],
  template: `
  <div *ngIf="toast() as t"
       class="toast-container position-fixed bottom-0 end-0 p-3">
    <div class="toast show"
         [class.bg-success]="t.type==='success'"
         [class.bg-danger]="t.type==='error'"
         [class.bg-info]="t.type==='info'"
         class="text-white">
      <div class="toast-body">
        {{ t.message }}
      </div>
    </div>
  </div>
  `
})
export class ToastComponent {
  toast;
 
  constructor(private toastService: ToastService) {
    this.toast = this.toastService.toast;
  }
}
