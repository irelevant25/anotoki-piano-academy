import { VISITOR_KEEP_DAYS, VISITOR_WORDS, visitorRefusalKey } from './visitor-words';

describe('visitor-words: practising without signing in', () => {
  it('keeps a visitor for 30 days - the {days} of the notice', () => {
    expect(VISITOR_KEEP_DAYS).toBe(30);
  });

  it('names the keys migration 005 wrote', () => {
    expect(Object.values(VISITOR_WORDS).sort()).toEqual(
      ['ownProgress.visitor', 'visitor.busy', 'visitor.close', 'visitor.full', 'visitor.kept', 'visitor.lost', 'visitor.moved', 'visitor.notMoved', 'visitor.notice', 'visitor.signInNow'].sort(),
    );
  });

  it('words a refused save of a visitor from its code: full, busy - nothing else', () => {
    expect(visitorRefusalKey(422, 'visitor_limit')).toBe('visitor.full');
    expect(visitorRefusalKey(413, 'too_large')).toBe('visitor.full');
    expect(visitorRefusalKey(429, 'too_many_visitors')).toBe('visitor.busy');
    expect(visitorRefusalKey(422, 'invalid')).toBeNull();
    expect(visitorRefusalKey(429, 'too_many_imports')).toBeNull();
    expect(visitorRefusalKey(401, 'visitor_unknown')).toBeNull();
    expect(visitorRefusalKey(0, undefined)).toBeNull();
  });
});
