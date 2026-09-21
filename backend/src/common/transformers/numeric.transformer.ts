import { ValueTransformer } from "typeorm";

// node-postgres returns NUMERIC columns as strings to avoid float precision
// loss. Money in this system is bounded (KES, 2dp, < 10^12) so Number() is
// safe, and it keeps API responses numeric instead of "12500.00" strings.
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
