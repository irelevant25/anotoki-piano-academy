import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, inject, input, viewChild } from '@angular/core';
import { TheoryService } from '../../../../shared/music/theory.service';
import { Notation } from './notation';

/**
 * A staff: the box VexFlow draws into. The page asks it for its Notation
 * (made on first use, once the box is in the page) and draws with that.
 *
 * VexFlow's SVG is made outside Angular's templates, so this component's
 * styles are not encapsulated; every rule in its .scss is scoped to
 * app-notation by hand.
 */
@Component({
  selector: 'app-notation',
  templateUrl: './notation.component.html',
  styleUrl: './notation.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotationComponent {
  private readonly theory = inject(TheoryService);
  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');
  private engine: Notation | null = null;

  /** Centre a single note (the drill's flashcards). */
  readonly center = input(false);

  notation(): Notation {
    return (this.engine ??= new Notation(this.box().nativeElement, this.theory));
  }
}
