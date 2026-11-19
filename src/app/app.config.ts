import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { DatabaseService } from './core/db/database.service';
import { IncentiveService } from './core/services/incentive.service';
import { EmployeeService } from './services/employee.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    provideAppInitializer(async () => {
      const database = inject(DatabaseService);
      const employeeService = inject(EmployeeService);
      const incentiveService = inject(IncentiveService);

      await database.init();
      await Promise.all([employeeService.load(), incentiveService.load()]);
    })
  ]
};
