// 示範一個使用Promise的簡易例子。
const exampleWithPromise = async () => {
    try {
        const result = await new Promise((resolve, reject) => setTimeout(() => resolve(10), 1000); // (1)
        console.log(result);
    } catch (error) {
        console.log("Promise 錯誤，將找到的結果給出來");
    }
};

exampleWithPromise(); // (2)
