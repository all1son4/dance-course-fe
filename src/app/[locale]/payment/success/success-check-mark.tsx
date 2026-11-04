import { Success } from "@/svg";

import { SuccessMarkBox } from "./success-entrance.styles";

/** The confirmed-payment mark: the green success icon with a one-off pop and halo. */
export default function SuccessCheckMark() {
  return (
    <SuccessMarkBox aria-hidden="true">
      <Success width={84} height={84} />
    </SuccessMarkBox>
  );
}
