import { useMediaQuery, useTheme } from '@mui/material';

/**
 * Hook to detect if current viewport is mobile
 * Uses MUI's sm breakpoint (600px) as the cutoff
 */
export const useIsMobile = (): boolean => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
};

/**
 * Hook to detect if current viewport is tablet or smaller
 * Uses MUI's md breakpoint (900px) as the cutoff
 */
export const useIsTablet = (): boolean => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
};

/**
 * Hook to detect if current viewport is desktop
 * Uses MUI's lg breakpoint (1200px) as the cutoff
 */
export const useIsDesktop = (): boolean => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.up('lg'));
};

/**
 * Hook that returns current breakpoint name
 */
export const useCurrentBreakpoint = (): 'xs' | 'sm' | 'md' | 'lg' | 'xl' => {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.only('xs'));
  const isSm = useMediaQuery(theme.breakpoints.only('sm'));
  const isMd = useMediaQuery(theme.breakpoints.only('md'));
  const isLg = useMediaQuery(theme.breakpoints.only('lg'));
  
  if (isXs) return 'xs';
  if (isSm) return 'sm';
  if (isMd) return 'md';
  if (isLg) return 'lg';
  return 'xl';
};

/**
 * Drawer width constant for consistent layout
 */
export const DRAWER_WIDTH = 240;

/**
 * Bottom navigation height constant
 */
export const BOTTOM_NAV_HEIGHT = 56;
