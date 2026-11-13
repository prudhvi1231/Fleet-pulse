import { AbstractControl, ValidationErrors, ValidatorFn, AsyncValidatorFn } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { APP_CONFIG } from '../../../core/config/app-config.js';

/**
 * Custom Cross-Field Validator:
 * Ensures that if a warning threshold is provided, it is strictly less than
 * the critical threshold for '>' and '>=' operators, or strictly greater for '<' and '<='.
 */
export function warningThresholdValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const threshold = control.get('threshold')?.value;
    const warning = control.get('warningThreshold')?.value;
    const operator = control.get('operator')?.value;

    if (warning === null || warning === undefined || warning === '' || threshold === null || threshold === undefined) {
      return null;
    }

    const t = Number(threshold);
    const w = Number(warning);

    if (isNaN(t) || isNaN(w)) return null;

    if ((operator === '>' || operator === '>=') && w >= t) {
      return { warningThresholdInvalid: 'Warning threshold must be lower than critical threshold' };
    }

    if ((operator === '<' || operator === '<=') && w <= t) {
      return { warningThresholdInvalid: 'Warning threshold must be higher than critical threshold' };
    }

    return null;
  };
}

/**
 * Custom Metric Range Validator:
 * Dynamic validation based on metric type (errRate: 0-100%, p95/rps: >= 0)
 */
export function metricRangeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const metric = control.get('metric')?.value;
    const threshold = control.get('threshold')?.value;

    if (threshold === null || threshold === undefined || threshold === '') {
      return null;
    }

    const val = Number(threshold);
    if (isNaN(val)) {
      return { invalidNumber: 'Threshold must be a valid number' };
    }

    if (metric === 'errRate' && (val < 0 || val > 100)) {
      return { outOfRange: 'Error rate must be a percentage between 0 and 100' };
    }

    if ((metric === 'p95' || metric === 'rps') && val < 0) {
      return { outOfRange: 'Threshold cannot be negative' };
    }

    return null;
  };
}

/**
 * Async Validator:
 * Checks if rule name is unique via GET /rules/check-name with debouncing.
 */
export function uniqueNameValidator(http: HttpClient, excludeId?: string): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const name = control.value;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return of(null);
    }

    return timer(300).pipe(
      switchMap(() => {
        const url = `${APP_CONFIG.apiBaseUrl}/rules/check-name?name=${encodeURIComponent(name.trim())}&excludeId=${excludeId || ''}`;
        return http.get<{ available: boolean }>(url).pipe(
          map((res) => (res.available ? null : { nameTaken: 'Rule name is already in use' })),
          catchError(() => of(null))
        );
      })
    );
  };
}
