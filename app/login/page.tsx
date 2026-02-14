import LoginClient from './LoginClient';

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const nextParam = searchParams?.next;
  const nextPath =
    typeof nextParam === 'string' && nextParam.length > 0
      ? nextParam
      : '/protected';

  return <LoginClient nextPath={nextPath} />;
}

