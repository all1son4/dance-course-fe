type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type StructuredDataValue = { [key: string]: JsonValue } | JsonValue[];

type StructuredDataProps = {
  data: StructuredDataValue;
};

const serializeStructuredData = (data: StructuredDataValue) =>
  JSON.stringify(data).replace(/</gu, "\\u003c");

export default function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(data) }}
    />
  );
}
