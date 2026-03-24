import clsx from "clsx";

interface SpinnerProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 24,
  className,
  color,
}) => {
  return (
    <div
      className={clsx("animate-spin rounded-full border-b-2 border-current", className)}
      style={{ width: size, height: size, color }}
    />
  );
};
