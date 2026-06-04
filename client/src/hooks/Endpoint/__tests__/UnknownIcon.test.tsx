import { render, screen } from '@testing-library/react';
import UnknownIcon from '../UnknownIcon';

describe('UnknownIcon', () => {
  it('uses the ArcheBase icon before remote endpoint config loads', () => {
    render(<UnknownIcon endpoint="ArcheBase" />);

    expect(screen.getByRole('img', { name: 'ArcheBase Icon' })).toHaveAttribute(
      'src',
      '/images/icon-square.png',
    );
  });
});
