import { useSearchParams } from 'react-router-dom';
import { AuthModal } from '../components/modals/AuthModal';
import { DEFAULT_APP_PATH } from '../constants/routes';

/**
 * Login page component that reuses AuthModal in embedded mode.
 * - Displays as a full page instead of a modal overlay
 * - Supports redirect after successful login via URL query param
 *
 * @returns Login page JSX
 */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || DEFAULT_APP_PATH;

  return (
    <AuthModal
      isOpen={true}
      onClose={() => {}}
      embedded={true}
      redirectPath={redirectPath}
    />
  );
}
