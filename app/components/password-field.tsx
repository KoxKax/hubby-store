import { useId, useState } from "react";

export function PasswordField({
  label = "Mật khẩu",
  name = "password",
  minLength = 1,
  autoComplete = "current-password",
  disabled = false,
}: {
  label?: string;
  name?: string;
  minLength?: number;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          minLength={minLength}
          maxLength={128}
          required
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          type="button"
          className="password-visibility"
          aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Ẩn" : "Hiện"}
        </button>
      </div>
      {autoComplete === "new-password" && (
        <small className="password-hint">
          Ít nhất {minLength} ký tự. Nên dùng mật khẩu riêng cho Hubby.
        </small>
      )}
    </div>
  );
}
