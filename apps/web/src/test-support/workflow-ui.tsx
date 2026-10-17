import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect } from "vitest";
import App from "../App";

export function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

export function change(
  label: string,
  value: string,
  scope: HTMLElement = document.body,
) {
  fireEvent.change(
    within(scope).getByLabelText(
      (content, element) => {
        const heading = element
          ?.closest("label")
          ?.querySelector(".label-with-help");
        return heading
          ? heading.firstChild?.textContent?.trim() === label
          : content === label;
      },
      {
        selector: 'input:not([type="checkbox"]), select, textarea',
      },
    ),
    {
      target: { value },
    },
  );
}

export function expand(text: string) {
  const details = screen.getByText(text, { exact: true }).closest("details")!;
  fireEvent.click(details.querySelector("summary")!);
  return details;
}

export async function save(title: string, button = "Salvar") {
  const dialog = screen.getByRole("dialog", { name: title });
  const action = within(dialog).getByRole("button", { name: button });
  await waitFor(() => expect(action).toBeEnabled());
  const form = action.closest("form");
  // jsdom does not update native file-input validity after a FileList change.
  // Browser scenarios exercise native validation; here the real API validates it.
  if (form) fireEvent.submit(form);
  else fireEvent.click(action);
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: title }),
    ).not.toBeInTheDocument(),
  );
}
