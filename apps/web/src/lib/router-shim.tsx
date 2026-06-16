"use client";

/**
 * Compatibility shims so legacy frontend code (react-router-dom) keeps
 * working under Next.js without a full rewrite of every call site.
 *
 *   const navigate = useNavigate();
 *   navigate("/inbox", { replace: true });
 *
 *   <NavLink to="/inbox">…</NavLink>
 *   <NavLink to="/inbox" className={({isActive}) => isActive ? "x" : "y"}>…</NavLink>
 */
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode, ComponentProps } from "react";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

export function useNavigate(): NavigateFn {
  const router = useRouter();
  return (path: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) router.replace(path);
    else router.push(path);
  };
}

type NavLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children" | "href"> & {
  to: string;
  href?: never;
  className?: string | ((state: { isActive: boolean }) => string);
  children?: ReactNode | ((state: { isActive: boolean }) => ReactNode);
  end?: boolean;
};

export function NavLink({ to, className, children, end, ...rest }: NavLinkProps) {
  const pathname = usePathname() ?? "";
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  const cls = typeof className === "function" ? className({ isActive }) : className;
  const kids = typeof children === "function" ? children({ isActive }) : children;
  return (
    <Link href={to} className={cls} {...rest}>
      {kids}
    </Link>
  );
}

export { Link };

/**
 * react-router-dom's <Outlet /> equivalent — children of the parent layout.
 * Next.js layouts already receive children as a prop; this shim keeps the
 * import compatible for unconverted layouts.
 */
export function Outlet({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * <Navigate to="/foo" replace /> equivalent — issues a router push in effect.
 */
import { useEffect } from "react";
export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Mirrors react-router-dom's useSearchParams — returns [URLSearchParams, setter]. */
import { useSearchParams as nextUseSearchParams } from "next/navigation";
export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams), opts?: { replace?: boolean }) => void] {
  const params = nextUseSearchParams() ?? new URLSearchParams();
  const router = useRouter();
  const setParams = (
    next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    opts?: { replace?: boolean }
  ) => {
    const value = typeof next === "function" ? next(new URLSearchParams(params.toString())) : next;
    const url = `?${value.toString()}`;
    if (opts?.replace) router.replace(url);
    else router.push(url);
  };
  return [new URLSearchParams(params.toString()), setParams];
}
