import { type TextProps } from 'ink';

import { type ComponentTheme } from '../../theme';

const theme = {
  styles: {
    value: (): TextProps => ({}),
  },
} satisfies ComponentTheme;

export default theme;
export type Theme = typeof theme;
