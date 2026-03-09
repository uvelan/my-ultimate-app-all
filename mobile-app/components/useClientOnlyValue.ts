import { useEffect, useState } from 'react';

export function useClientOnlyValue<S, C>(web: S, native: C): S | C {
    const [value, setValue] = useState<S | C>(web);

    useEffect(() => {
        setValue(native);
    }, [native]);

    return value;
}
