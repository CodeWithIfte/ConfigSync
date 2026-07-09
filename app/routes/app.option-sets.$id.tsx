import {
    useFetcher,
    useNavigate,
    type ActionFunctionArgs,
    type HeadersFunction,
    type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "app/shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  return { message: "FAQ created successfully" };
};

const OptionSetEditorPage = () => {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const saveBarId = "settings-save-bar";
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      shopify.saveBar.hide(saveBarId);
      navigate("/app");
    }
  }, [fetcher.data, navigate]);

  const markUnsaved = () => {
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true);
      shopify.saveBar.show(saveBarId);
    }
  };

  const handleDiscard = () => {
    setQuestion("");
    setAnswer("");
    setCategoryId("");
    setStatus(true);
    setHasUnsavedChanges(false);
    shopify.saveBar.hide(saveBarId);
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("question", question);
    formData.append("answer", answer);
    formData.append("categoryId", categoryId);
    formData.append("status", status ? "on" : "off");
    fetcher.submit(formData, { method: "post" });
    setHasUnsavedChanges(false);
  };

  return (
    <s-page heading="Create Option Set">
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
      <s-link slot="breadcrumb-actions" href="/app">
        Home
      </s-link>
      <s-button slot="secondary-actions">Duplicate</s-button>
      <s-button slot="secondary-actions" tone="critical">
        Delete
      </s-button>
      <s-section>
        <s-grid gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="start">
            <s-grid-item>
              <s-text-field
                label="Option set title"
                labelAccessibilityVisibility="visible"
                placeholder="Enter the FAQ question"
                required
                details="Not visible to customers."
                value={question}
                onInput={(e) => {}}
              />
            </s-grid-item>
            <s-grid-item>
              <s-number-field label="Rank" defaultValue={"1"}></s-number-field>
            </s-grid-item>
          </s-grid>
        </s-grid>
      </s-section>
      <s-section heading="Options">
        <s-box border="base" borderRadius="base">
          <s-grid gap="base" justifyItems="center" paddingBlock="base">
            <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
              <s-stack alignItems="center">
                <s-heading>Add options to this option set</s-heading>
                <s-paragraph>
                  Every option set consists of one or more options. One option
                  is a specific thing the customer can customize (e.g., Color).
                  There are several option types to choose from (e.g., checkbox,
                  text box).
                </s-paragraph>
              </s-stack>
              <s-button-group>
                <s-button slot="secondary-actions">
                  Add existing option
                </s-button>
                <s-button slot="primary-action">Create new option</s-button>
              </s-button-group>
            </s-grid>
          </s-grid>
        </s-box>
      </s-section>
      <s-section heading="Rules">
        <s-box border="base" borderRadius="base">
          <s-grid gap="base" justifyItems="center" paddingBlock="base">
            <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
              <s-stack alignItems="center">
                <s-heading>Create rule</s-heading>
                <s-paragraph>
                  Rules allow you to hide/show options or values based on the
                  customer’s previous choices. For example, if you sell T-shirts
                  with a custom text option and the customer selects &apos;Add
                  custom text&apos;, you can set a rule to display the text box.
                </s-paragraph>
              </s-stack>
              <s-button-group>
                <s-button slot="primary-action">Create rule</s-button>
              </s-button-group>
            </s-grid>
          </s-grid>
        </s-box>
      </s-section>
      <s-box slot="aside">
        <s-section heading="Add to products">
          <s-choice-list>
            <s-choice value="manual">
              Manually
              <s-text slot="details">
                Choose products manually from the list below.
              </s-text>
            </s-choice>

            <s-choice value="automatic">
              Automatically
              <s-text slot="details">
                Choose products manually from the list below.
              </s-text>
            </s-choice>
          </s-choice-list>
        </s-section>
      </s-box>
      <s-box slot="aside">
        <s-section>
          <s-search-field
            label="Search"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search items"
          ></s-search-field>
        </s-section>
      </s-box>
    </s-page>
  );
};

export default OptionSetEditorPage;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
