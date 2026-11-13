import { describe, it, expect } from 'vitest';
import { FormControl, FormGroup, ValidationErrors } from '@angular/forms';
import { of, Observable, firstValueFrom } from 'rxjs';
import { warningThresholdValidator, metricRangeValidator, uniqueNameValidator } from './rule.validators.js';

describe('Custom Rule Validators', () => {
  describe('warningThresholdValidator (Cross-field validator)', () => {
    it('should validate that warning threshold is strictly lower than critical threshold for > operator', () => {
      const validator = warningThresholdValidator();

      // Valid: warning 400 < critical 500
      const validGroup = new FormGroup({
        operator: new FormControl('>'),
        threshold: new FormControl(500),
        warningThreshold: new FormControl(400)
      });
      expect(validator(validGroup)).toBeNull();

      // Invalid: warning 600 > critical 500
      const invalidGroup = new FormGroup({
        operator: new FormControl('>'),
        threshold: new FormControl(500),
        warningThreshold: new FormControl(600)
      });
      expect(validator(invalidGroup)).toEqual({
        warningThresholdInvalid: 'Warning threshold must be lower than critical threshold'
      });

      // Invalid: warning 500 === critical 500
      const equalGroup = new FormGroup({
        operator: new FormControl('>'),
        threshold: new FormControl(500),
        warningThreshold: new FormControl(500)
      });
      expect(validator(equalGroup)).toEqual({
        warningThresholdInvalid: 'Warning threshold must be lower than critical threshold'
      });
    });

    it('should validate that warning threshold is strictly higher for < operator', () => {
      const validator = warningThresholdValidator();

      const validGroup = new FormGroup({
        operator: new FormControl('<'),
        threshold: new FormControl(100),
        warningThreshold: new FormControl(150)
      });
      expect(validator(validGroup)).toBeNull();

      const invalidGroup = new FormGroup({
        operator: new FormControl('<'),
        threshold: new FormControl(100),
        warningThreshold: new FormControl(80)
      });
      expect(validator(invalidGroup)).toEqual({
        warningThresholdInvalid: 'Warning threshold must be higher than critical threshold'
      });
    });

    it('should pass if warning threshold is omitted', () => {
      const validator = warningThresholdValidator();
      const group = new FormGroup({
        operator: new FormControl('>'),
        threshold: new FormControl(500),
        warningThreshold: new FormControl(null)
      });
      expect(validator(group)).toBeNull();
    });
  });

  describe('metricRangeValidator (Dynamic validation by metric type)', () => {
    const validator = metricRangeValidator();

    it('should enforce percentage range 0-100 for errRate metric', () => {
      const validGroup = new FormGroup({
        metric: new FormControl('errRate'),
        threshold: new FormControl(12.5)
      });
      expect(validator(validGroup)).toBeNull();

      const invalidOver100 = new FormGroup({
        metric: new FormControl('errRate'),
        threshold: new FormControl(105)
      });
      expect(validator(invalidOver100)).toEqual({
        outOfRange: 'Error rate must be a percentage between 0 and 100'
      });

      const invalidNegative = new FormGroup({
        metric: new FormControl('errRate'),
        threshold: new FormControl(-1)
      });
      expect(validator(invalidNegative)).toEqual({
        outOfRange: 'Error rate must be a percentage between 0 and 100'
      });
    });

    it('should reject negative values for p95 and rps', () => {
      const group = new FormGroup({
        metric: new FormControl('p95'),
        threshold: new FormControl(-10)
      });
      expect(validator(group)).toEqual({
        outOfRange: 'Threshold cannot be negative'
      });
    });
  });

  describe('uniqueNameValidator (Async validator)', () => {
    it('should return null when rule name is available', async () => {
      const mockHttp = {
        get: () => of({ available: true })
      } as any;

      const validator = uniqueNameValidator(mockHttp);
      const control = new FormControl('Unique Rule Name');

      const res = await firstValueFrom(validator(control) as Observable<ValidationErrors | null>);
      expect(res).toBeNull();
    });

    it('should return nameTaken error when rule name exists', async () => {
      const mockHttp = {
        get: () => of({ available: false })
      } as any;

      const validator = uniqueNameValidator(mockHttp);
      const control = new FormControl('Existing Rule Name');

      const res = await firstValueFrom(validator(control) as Observable<ValidationErrors | null>);
      expect(res).toEqual({ nameTaken: 'Rule name is already in use' });
    });
  });
});
