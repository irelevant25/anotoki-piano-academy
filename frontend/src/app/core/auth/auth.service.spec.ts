import { describeSignInFailure } from './auth.service';

describe('describeSignInFailure', () => {
  it('says nothing when nothing went wrong', () => {
    expect(describeSignInFailure(null)).toBe('');
  });

  it('shows the IAM\'s own words when it turned the account away', () => {
    expect(describeSignInFailure({ code: 'access_denied', message: 'This account cannot use Piano Academy' })).toBe('This account cannot use Piano Academy.');
    expect(describeSignInFailure({ code: 'access_denied', message: 'The sign-in was cancelled.' })).toBe('The sign-in was cancelled.');
  });

  it('calls a refusal without words a cancel', () => {
    expect(describeSignInFailure({ code: 'access_denied', message: '' })).toBe('The sign-in was cancelled.');
  });

  it('asks to try again after anything else, naming what happened', () => {
    expect(describeSignInFailure({ code: 'state_mismatch', message: 'That sign-in did not start here, or took too long' })).toBe(
      'Signing in did not work. Please try again. (That sign-in did not start here, or took too long)',
    );
    expect(describeSignInFailure({ code: 'invalid_grant', message: '' })).toBe('Signing in did not work. Please try again. (invalid_grant)');
  });
});
