import { Routes } from '@angular/router';
import { SchemeFormComponent } from './incentive-scheme/scheme-form.component';
import { SalesEntryComponent } from './sales-entry/sales-entry.component';
import { EmployeeEntryComponent } from './employee-entry/employee-entry.component';
import { ProductsEntryComponent } from './products-details/products-entry.component';
import { WarrantyEntryComponent } from './warranty-entry/warranty-entry.component';
import { AccessoryEntryComponent } from './accessory-entry/accessory-entry.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'scheme',
    pathMatch: 'full'
  },
  {
    path: 'scheme',
    component: SchemeFormComponent,
    title: 'Incentive Scheme Setup'
  },
  {
    path: 'products-entry',
    component: ProductsEntryComponent,
    title: 'Products Entry'
  },
  {
    path: 'sales-entry',
    component: SalesEntryComponent,
    title: 'Sales Entry'
  },
  {
    path: 'warranty-entry',
    component: WarrantyEntryComponent,
    title: 'Warranty Entry'
  },
  {
    path: 'accessory-entry',
    component: AccessoryEntryComponent,
    title: 'Accessory Entry'
  },
  {
    path: 'employee-entry',
    component: EmployeeEntryComponent
  },
  {
    path: '**',
    redirectTo: 'scheme'
  }
];