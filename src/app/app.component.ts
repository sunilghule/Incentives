import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Incentive Management System';
  currentYear = new Date().getFullYear();
  collapsed = false;

  sidebarItems = [
    { label: 'Sales Entry', link: '/sales-entry', icon: 'bi bi-cart-plus', tooltip: 'Sales Entry' },
    { label: 'Warranty Entry', link: '/warranty-entry', icon: 'bi bi-shield-check', tooltip: 'Warranty Entry' },
    { label: 'Accessory Entry', link: '/accessory-entry', icon: 'bi bi-tools', tooltip: 'Accessory Entry' },
    { label: 'Incentive Scheme', link: '/scheme', icon: 'bi bi-cash-stack', tooltip: 'Incentive Scheme' },
    { label: 'Employee Entry', link: '/employee-entry', icon: 'bi bi-person-badge', tooltip: 'Employee Entry' },
    { label: 'Products Entry', link: '/products-entry', icon: 'bi bi-car-front', tooltip: 'Products Entry' }
  ];

  constructor(private readonly router: Router) { }

  isActive(route: string): boolean {
    return this.router.url === route;
  }
}