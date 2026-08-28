export type CourseSignupDialogProps = {
  triggerText: string;
  /** When set, a sticky duplicate of the trigger follows the reader down the page. */
  stickyCta?: {
    title: string;
    note?: string;
  };
};

export type CourseSignupFormValues = {
  consentAccepted: boolean;
  email: string;
  fullName: string;
  socialContact: string;
};
