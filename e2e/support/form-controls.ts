import { expect, type Locator, type Page } from "@playwright/test";

export async function selectFormOption(
  page: Page,
  combobox: Locator,
  optionName: string | RegExp,
): Promise<void> {
  await combobox.click();

  const listbox = page.getByRole("listbox").filter({ visible: true });
  await expect(listbox).toHaveCount(1);
  const option = listbox.getByRole("option", {
    name: optionName,
    exact: typeof optionName === "string",
  });
  await expect(option).toHaveCount(1);
  await option.click();
  await expect(combobox).toContainText(optionName);
}
