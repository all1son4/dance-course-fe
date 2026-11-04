import { SuccessMarkSvg } from "./success-entrance.styles";

/**
 * The confirmed-payment mark: a brand-red ring and check that draw themselves
 * in (see success-entrance.styles for the timeline). `pathLength="1"` lets
 * the stroke animation work in fractions of the path, whatever its size.
 */
export default function SuccessCheckMark() {
  return (
    <SuccessMarkSvg viewBox="0 0 84 84" aria-hidden="true" focusable="false">
      <circle className="success-mark__disc" cx="42" cy="42" r="38" />
      <path className="success-mark__halo" d="M42 4a38 38 0 1 1 0 76a38 38 0 1 1 0-76" />
      <path
        className="success-mark__ring"
        d="M42 4a38 38 0 1 1 0 76a38 38 0 1 1 0-76"
        pathLength={1}
      />
      <path className="success-mark__check" d="M26.5 43.5 37 54l21-22" pathLength={1} />
    </SuccessMarkSvg>
  );
}
