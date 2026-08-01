import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

import type { SelectOption, StatusMessage } from "../lib/admin.types";
import {
  ButtonRow,
  Form,
  FormControl,
  StatusText,
  SurfaceCard,
  SurfaceDescription,
  SurfaceTitle,
  WorkspaceGrid,
  WorkspacePrimary,
} from "../page.styles";

type ReportsWorkspaceProps = {
  isDisabled: boolean;
  isGenerating: boolean;
  isLoadingMonths: boolean;
  month: string;
  monthOptions: SelectOption[];
  onGenerate: () => void | Promise<void>;
  onMonthChange: (value: string) => void;
  status: StatusMessage;
};

export const ReportsWorkspace = ({
  isDisabled,
  isGenerating,
  isLoadingMonths,
  month,
  monthOptions,
  onGenerate,
  onMonthChange,
  status,
}: ReportsWorkspaceProps) => (
  <WorkspaceGrid>
    <WorkspacePrimary>
      <SurfaceCard>
        <SurfaceTitle>Ежемесячный отчет по продажам</SurfaceTitle>
        <SurfaceDescription>Готовый отчет придет на рабочую почту.</SurfaceDescription>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void onGenerate();
          }}
        >
          {monthOptions.length > 0 && (
            <FormControl>
              <Input
                id="monthly-sales-report-month"
                name="monthlySalesReportMonth"
                label="Месяц отчета"
                value={month}
                placeholder="Выбери месяц"
                selectOptions={monthOptions}
                onChange={(event) => onMonthChange(event.target.value)}
                disabled={isGenerating}
                width="100%"
              />
            </FormControl>
          )}
          <ButtonRow>
            <Button
              buttonText={
                isGenerating
                  ? "Отправляю..."
                  : isLoadingMonths
                    ? "Загружаю месяцы..."
                    : monthOptions.length === 0
                      ? "Нет подтвержденных продаж"
                      : "Сформировать и отправить отчет"
              }
              type="submit"
              disabled={isDisabled}
              isLoading={isGenerating}
              width="100%"
            />
          </ButtonRow>
          {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
        </Form>
      </SurfaceCard>
    </WorkspacePrimary>
  </WorkspaceGrid>
);
