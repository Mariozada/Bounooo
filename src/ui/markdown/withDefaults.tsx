const mergeClassNames = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(' ')

export const withDefaultProps =
  <TProps extends { className?: string | undefined }>({
    className,
    ...defaultProps
  }: Partial<TProps>) =>
  ({ className: classNameProp, ...props }: TProps) => {
    return {
      className: mergeClassNames(className, classNameProp),
      ...defaultProps,
      ...props,
    } as TProps
  }
