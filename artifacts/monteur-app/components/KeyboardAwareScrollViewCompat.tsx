import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
} from "react-native";

type Props = ScrollViewProps & {
  // Behouden voor API-compatibiliteit met eerdere aanroepen; niet nodig met de
  // ingebouwde KeyboardAvoidingView.
  bottomOffset?: number;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  bottomOffset: _bottomOffset,
  ...props
}: Props) {
  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
